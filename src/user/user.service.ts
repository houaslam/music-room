import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Users } from './entity/user.entity.js';
import { DeleteResult, Repository } from 'typeorm';
import { CreateUserDTO } from './dto/create-user.dto.js';
import { DeleteUserDTO } from './dto/delete-user.dto.js';
import { ReadUserDTO } from './dto/read-user.dto.js';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(Users)
    private readonly userRepository: Repository<Users>,
  ) {}

  async create(createUserDTO: CreateUserDTO): Promise<Users> {
    const existingUser = await this.read({ email: createUserDTO.email });
    if (existingUser)
      throw new HttpException(
        { message: 'Email is already taken!', code: 'EMAIL_TAKEN' },
        HttpStatus.CONFLICT,
      );
    const newUser = this.userRepository.create(createUserDTO);
    return await this.userRepository.save(newUser);
  }

  async delete(deleteUserDTO: DeleteUserDTO): Promise<DeleteResult> {
    return await this.userRepository
      .createQueryBuilder()
      .delete()
      .from(Users)
      .where('id = :id', { id: deleteUserDTO.id })
      .execute();
  }

  async read(readUserDTO: ReadUserDTO): Promise<Users | null> {
    return await this.userRepository.findOne({
      where: {
        email: readUserDTO.email,
      },
    });
  }
}
